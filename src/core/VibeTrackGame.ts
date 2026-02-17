import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { VehicleAudio } from "../audio/VehicleAudio";
import { ChaseCameraRig } from "../camera/ChaseCamera";
import { RaceSession } from "../gameplay/raceSession";
import { resolveRespawnPose } from "../gameplay/respawn";
import { InputManager } from "../input/InputManager";
import { VehicleController } from "../physics/VehicleController";
import { FixedStepRunner } from "./fixedStep";
import { TrackRuntime } from "../track/TrackRuntime";
import { loadPremiumTrack } from "../track/loadTrack";
import { Hud } from "../ui/Hud";
import {
  DebugSnapshot,
  InputState,
  QualityPreset,
  RaceState,
  RuntimeOptions,
  VehicleTelemetry,
  VehicleTuning
} from "../types";

const FIXED_STEP_SECONDS = 1 / 120;
const BEST_LAP_STORAGE_KEY = "vibetrack.bestLapMs";
const BEST_SPLITS_STORAGE_KEY = "vibetrack.bestSplitsMs";
const AUTO_RIGHT_TRIGGER_MS = 1200;
const ACTION_FREEZE_MS = 30;

declare global {
  interface Window {
    __VIBETRACK_DEBUG__?: DebugSnapshot;
  }
}

const DEFAULT_TUNING: VehicleTuning = {
  massKg: 1200,
  maxSpeedKmh: 315,
  engineForce: 4200,
  brakeForce: 95,
  steerRateLowSpeed: 0.6,
  steerRateHighSpeed: 0.31,
  steerBlendKmh: 220,
  suspensionRest: 0.35,
  suspensionSpring: 42,
  suspensionDamper: 4.2,
  tireGrip: 3.2,
  driftGripFactorRear: 0.54,
  airControlTorque: 13,
  airControlFactor: 0.6,
  yawStabilityGain: 2.15,
  yawStabilityMaxTorque: 8.5,
  slipAssistGain: 5.8,
  slipAssistMaxTorque: 5.4
};

function parseBestSplits(rawValue: string | null): number[] | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const splits = parsed
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => Math.max(0, value));

    return splits.length > 0 ? splits : null;
  } catch {
    return null;
  }
}

function parseQualityPreset(search: string): QualityPreset {
  const params = new URLSearchParams(search);
  const qualityParam = params.get("quality");
  return qualityParam === "medium" ? "medium" : "high";
}

function resolveRuntimeOptions(search: string): RuntimeOptions {
  return {
    quality: parseQualityPreset(search)
  };
}

export class VibeTrackGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly world: RAPIER.World;
  private readonly input: InputManager;
  private readonly hud: Hud;
  private readonly audio: VehicleAudio;

  private readonly track: TrackRuntime;
  private readonly vehicle: VehicleController;
  private readonly chaseCamera: ChaseCameraRig;
  private readonly raceSession: RaceSession;

  private readonly fixedStepRunner = new FixedStepRunner(FIXED_STEP_SECONDS);
  private readonly clock = new THREE.Clock();
  private readonly runtimeOptions: RuntimeOptions;

  private readonly workingPosition = new THREE.Vector3();
  private readonly workingForward = new THREE.Vector3();
  private readonly workingUp = new THREE.Vector3();
  private readonly currentInputState: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    respawn: false,
    restart: false
  };
  private readonly simulationInputState: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    respawn: false,
    restart: false
  };

  private activeCheckpointOrders = new Set<number>();
  private activeBoostIds = new Set<string>();

  private lastCheckpointOrder = -1;
  private lastPhase: RaceState["phase"] = "idle";
  private autoRightCountdownMs = 0;
  private freezeRemainingMs = 0;

  private running = false;
  private rafId: number | null = null;

  private readonly resizeHandler = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    const pixelRatioCap = this.runtimeOptions.quality === "high" ? 2 : 1.25;
    this.renderer.setPixelRatio(Math.min(pixelRatioCap, window.devicePixelRatio));
  };

  static async bootstrap(container: HTMLElement): Promise<VibeTrackGame> {
    await RAPIER.init();
    const runtimeOptions = resolveRuntimeOptions(window.location.search);
    const highQuality = runtimeOptions.quality === "high";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#79bfdc");
    scene.fog = highQuality
      ? new THREE.Fog("#79bfdc", 120, 460)
      : new THREE.Fog("#79bfdc", 90, 320);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = highQuality;
    renderer.shadowMap.type = highQuality ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;

    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1300);

    const world = new RAPIER.World({ x: 0, y: -29.5, z: 0 });
    world.timestep = FIXED_STEP_SECONDS;

    const ambientLight = new THREE.HemisphereLight("#ecf8ff", "#2b5533", 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight("#fff8df", 1.55);
    sunLight.position.set(120, 220, 90);
    sunLight.castShadow = highQuality;
    if (highQuality) {
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 600;
      sunLight.shadow.camera.left = -180;
      sunLight.shadow.camera.right = 180;
      sunLight.shadow.camera.top = 180;
      sunLight.shadow.camera.bottom = -180;
    }
    scene.add(sunLight);

    const trackDefinition = loadPremiumTrack();
    const trackRuntime = new TrackRuntime(world, scene, trackDefinition);

    const vehicle = new VehicleController(
      world,
      scene,
      trackRuntime.getSpawnPose(),
      DEFAULT_TUNING
    );

    const chaseCamera = new ChaseCameraRig(camera);
    chaseCamera.reset(
      vehicle.getPosition(new THREE.Vector3()),
      vehicle.getForwardVector(new THREE.Vector3()),
      vehicle.getUpVector(new THREE.Vector3())
    );

    const savedBestMsRaw = window.localStorage.getItem(BEST_LAP_STORAGE_KEY);
    const savedBestMs = Number(savedBestMsRaw);
    const initialBestMs = Number.isFinite(savedBestMs) ? savedBestMs : null;
    const savedBestSplitsRaw = window.localStorage.getItem(BEST_SPLITS_STORAGE_KEY);
    const initialBestSplits = parseBestSplits(savedBestSplitsRaw);

    const raceSession = new RaceSession(
      trackDefinition.checkpoints.length,
      initialBestMs,
      initialBestSplits
    );

    const input = new InputManager(window);
    const hud = new Hud();
    const audio = new VehicleAudio();

    container.replaceChildren(renderer.domElement);

    return new VibeTrackGame(
      renderer,
      scene,
      camera,
      world,
      input,
      hud,
      audio,
      trackRuntime,
      vehicle,
      chaseCamera,
      raceSession,
      runtimeOptions
    );
  }

  private constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    world: RAPIER.World,
    input: InputManager,
    hud: Hud,
    audio: VehicleAudio,
    track: TrackRuntime,
    vehicle: VehicleController,
    chaseCamera: ChaseCameraRig,
    raceSession: RaceSession,
    runtimeOptions: RuntimeOptions
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.hud = hud;
    this.audio = audio;
    this.track = track;
    this.vehicle = vehicle;
    this.chaseCamera = chaseCamera;
    this.raceSession = raceSession;
    this.runtimeOptions = runtimeOptions;

    this.resizeHandler();
    window.addEventListener("resize", this.resizeHandler);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.clock.start();
    this.frame();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.input.dispose();
    window.removeEventListener("resize", this.resizeHandler);
    delete window.__VIBETRACK_DEBUG__;
  }

  private readonly frame = (): void => {
    if (!this.running) {
      return;
    }

    const deltaSeconds = Math.min(0.05, this.clock.getDelta());
    const inputState = this.input.update();
    Object.assign(this.currentInputState, inputState);

    this.handleOneShotActions(inputState);

    if (this.input.hasIntent(inputState)) {
      this.audio.ensureStarted();
    }

    this.fixedStepRunner.step(deltaSeconds, (fixedDelta) => {
      if (this.freezeRemainingMs > 0) {
        return;
      }
      this.simulate(fixedDelta, inputState);
    });

    if (this.freezeRemainingMs > 0) {
      this.freezeRemainingMs = Math.max(0, this.freezeRemainingMs - deltaSeconds * 1000);
    }

    const telemetry = this.vehicle.getTelemetry();
    const raceState = this.raceSession.getState(telemetry.speedKmh);
    this.persistBestLapIfNeeded(raceState);

    this.vehicle.getPosition(this.workingPosition);
    this.vehicle.getForwardVector(this.workingForward);
    this.vehicle.getUpVector(this.workingUp);

    this.chaseCamera.update(
      this.workingPosition,
      this.workingForward,
      this.workingUp,
      telemetry.speedKmh,
      deltaSeconds
    );

    this.audio.update(
      telemetry.speedKmh,
      raceState.phase === "running" ? inputState.throttle : 0,
      telemetry.boostRemainingMs > 0
    );

    this.hud.update(raceState, telemetry, this.autoRightCountdownMs);
    this.publishDebugState(raceState, telemetry);

    this.renderer.render(this.scene, this.camera);
    this.rafId = window.requestAnimationFrame(this.frame);
  };

  private simulate(fixedDelta: number, inputState: InputState): void {
    this.raceSession.update(
      fixedDelta * 1000,
      inputState.throttle > 0.04 || inputState.brake > 0.04
    );

    this.vehicle.preStep(this.getDrivingInput(inputState), fixedDelta);
    this.world.step();
    this.vehicle.postStep(fixedDelta);

    this.updateAutoRight(fixedDelta);
    this.processTrackTriggers();
  }

  private processTrackTriggers(): void {
    this.vehicle.getPosition(this.workingPosition);

    const checkpointOrders = this.track.getCheckpointOrdersAtPosition(this.workingPosition);
    const checkpointSet = new Set(checkpointOrders);

    for (const checkpointOrder of checkpointSet) {
      if (!this.activeCheckpointOrders.has(checkpointOrder)) {
        const result = this.raceSession.registerCheckpoint(checkpointOrder);
        if (result.valid) {
          this.lastCheckpointOrder = checkpointOrder;
          this.track.highlightCheckpoint(checkpointOrder);
          this.audio.playCheckpoint();
          if (result.finished) {
            this.audio.playFinish();
          }
        }
      }
    }

    this.activeCheckpointOrders = checkpointSet;

    const boostPads = this.track.getBoostPadsAtPosition(this.workingPosition);
    const nextBoostIds = new Set(boostPads.map((boostPad) => boostPad.id));

    for (const boostPad of boostPads) {
      if (!this.activeBoostIds.has(boostPad.id)) {
        this.vehicle.activateBoost(boostPad.force, boostPad.durationMs);
        this.audio.playBoost();
      }
    }

    this.activeBoostIds = nextBoostIds;
  }

  private handleOneShotActions(inputState: InputState): void {
    if (inputState.restart) {
      this.raceSession.restartRun();
      this.lastCheckpointOrder = -1;
      this.activeCheckpointOrders = new Set<number>();
      this.activeBoostIds = new Set<string>();
      this.autoRightCountdownMs = 0;
      this.vehicle.respawn(this.track.getSpawnPose());
      this.triggerActionFreeze();
      return;
    }

    if (inputState.respawn) {
      this.vehicle.respawn(
        resolveRespawnPose(this.track.definition, this.lastCheckpointOrder)
      );
      this.activeCheckpointOrders = new Set<number>();
      this.activeBoostIds = new Set<string>();
      this.autoRightCountdownMs = 0;
      this.triggerActionFreeze();
    }
  }

  private triggerActionFreeze(): void {
    this.freezeRemainingMs = ACTION_FREEZE_MS;
  }

  private getDrivingInput(inputState: InputState): InputState {
    if (this.raceSession.getPhase() === "running") {
      return inputState;
    }

    this.simulationInputState.throttle = 0;
    this.simulationInputState.brake = 0;
    this.simulationInputState.steer = 0;
    this.simulationInputState.handbrake = false;
    this.simulationInputState.respawn = false;
    this.simulationInputState.restart = false;
    return this.simulationInputState;
  }

  private persistBestLapIfNeeded(raceState: RaceState): void {
    if (raceState.phase === "finished" && this.lastPhase !== "finished" && raceState.bestMs !== null) {
      window.localStorage.setItem(BEST_LAP_STORAGE_KEY, Math.round(raceState.bestMs).toString());

      const bestSplits = this.raceSession.getBestSplits();
      if (bestSplits) {
        window.localStorage.setItem(BEST_SPLITS_STORAGE_KEY, JSON.stringify(bestSplits));
      }
    }

    this.lastPhase = raceState.phase;
  }

  private updateAutoRight(deltaSeconds: number): void {
    const telemetry = this.vehicle.getTelemetry();
    const shouldTrackAutoRight =
      this.vehicle.isUpsideDown() && !telemetry.isGrounded && telemetry.speedKmh < 45;

    if (!shouldTrackAutoRight) {
      this.autoRightCountdownMs = 0;
      return;
    }

    this.autoRightCountdownMs += deltaSeconds * 1000;
    if (this.autoRightCountdownMs < AUTO_RIGHT_TRIGGER_MS) {
      return;
    }

    this.autoRightCountdownMs = 0;
    this.activeCheckpointOrders = new Set<number>();
    this.activeBoostIds = new Set<string>();
    this.vehicle.respawn(
      resolveRespawnPose(this.track.definition, this.lastCheckpointOrder)
    );
  }

  private publishDebugState(raceState: RaceState, telemetry: VehicleTelemetry): void {
    window.__VIBETRACK_DEBUG__ = {
      speedKmh: telemetry.speedKmh,
      phase: raceState.phase,
      quality: this.runtimeOptions.quality,
      position: [
        this.workingPosition.x,
        this.workingPosition.y,
        this.workingPosition.z
      ],
      forward: [this.workingForward.x, this.workingForward.y, this.workingForward.z],
      up: [this.workingUp.x, this.workingUp.y, this.workingUp.z],
      checkpointOrder: raceState.currentCheckpointOrder,
      boostRemainingMs: telemetry.boostRemainingMs,
      inputSteer: this.currentInputState.steer,
      steeringAngle: this.vehicle.getSteeringAngle(),
      autoRightCountdownMs: this.autoRightCountdownMs,
      slipAngleDeg: this.vehicle.getSlipAngleDeg(),
      yawRate: this.vehicle.getYawRate(),
      yawAssistTorque: this.vehicle.getYawAssistTorque()
    };
  }
}
