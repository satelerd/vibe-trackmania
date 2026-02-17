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
import { InputState, RaceState, VehicleTuning } from "../types";

const FIXED_STEP_SECONDS = 1 / 120;
const BEST_LAP_STORAGE_KEY = "vibetrack.bestLapMs";

const DEFAULT_TUNING: VehicleTuning = {
  massKg: 1200,
  maxSpeedKmh: 315,
  engineForce: 158,
  brakeForce: 62,
  steerRate: 0.53,
  suspensionRest: 0.35,
  suspensionSpring: 36,
  suspensionDamper: 3.9,
  tireGrip: 2.3,
  driftGripFactorRear: 0.54,
  airControlTorque: 13
};

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

  private readonly workingPosition = new THREE.Vector3();
  private readonly workingForward = new THREE.Vector3();

  private activeCheckpointOrders = new Set<number>();
  private activeBoostIds = new Set<string>();

  private lastCheckpointOrder = -1;
  private lastPhase: RaceState["phase"] = "idle";

  private running = false;
  private rafId: number | null = null;

  private readonly resizeHandler = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  };

  static async bootstrap(container: HTMLElement): Promise<VibeTrackGame> {
    await RAPIER.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#79bfdc");
    scene.fog = new THREE.Fog("#79bfdc", 120, 460);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1300);

    const world = new RAPIER.World({ x: 0, y: -29.5, z: 0 });
    world.timestep = FIXED_STEP_SECONDS;

    const ambientLight = new THREE.HemisphereLight("#ecf8ff", "#2b5533", 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight("#fff8df", 1.55);
    sunLight.position.set(120, 220, 90);
    sunLight.castShadow = true;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 600;
    sunLight.shadow.camera.left = -180;
    sunLight.shadow.camera.right = 180;
    sunLight.shadow.camera.top = 180;
    sunLight.shadow.camera.bottom = -180;
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
      vehicle.getForwardVector(new THREE.Vector3())
    );

    const savedBestMsRaw = window.localStorage.getItem(BEST_LAP_STORAGE_KEY);
    const savedBestMs = Number(savedBestMsRaw);
    const initialBestMs = Number.isFinite(savedBestMs) ? savedBestMs : null;

    const raceSession = new RaceSession(trackDefinition.checkpoints.length, initialBestMs);

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
      raceSession
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
    raceSession: RaceSession
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
  }

  private readonly frame = (): void => {
    if (!this.running) {
      return;
    }

    const deltaSeconds = Math.min(0.05, this.clock.getDelta());
    const inputState = this.input.update();

    this.handleOneShotActions(inputState);

    if (this.input.hasIntent(inputState)) {
      this.audio.ensureStarted();
    }

    this.fixedStepRunner.step(deltaSeconds, (fixedDelta) => {
      this.simulate(fixedDelta, inputState);
    });

    const telemetry = this.vehicle.getTelemetry();
    const raceState = this.raceSession.getState(telemetry.speedKmh);
    this.persistBestLapIfNeeded(raceState);

    this.vehicle.getPosition(this.workingPosition);
    this.vehicle.getForwardVector(this.workingForward);

    this.chaseCamera.update(
      this.workingPosition,
      this.workingForward,
      telemetry.speedKmh,
      deltaSeconds
    );

    this.audio.update(
      telemetry.speedKmh,
      inputState.throttle,
      telemetry.boostRemainingMs > 0
    );

    this.hud.update(raceState, telemetry, this.raceSession.getCountdownRemainingMs());

    this.renderer.render(this.scene, this.camera);
    this.rafId = window.requestAnimationFrame(this.frame);
  };

  private simulate(fixedDelta: number, inputState: InputState): void {
    this.raceSession.update(
      fixedDelta * 1000,
      inputState.throttle > 0.04 || inputState.brake > 0.04
    );

    this.vehicle.preStep(inputState, fixedDelta);
    this.world.step();
    this.vehicle.postStep(fixedDelta);

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
      this.vehicle.respawn(this.track.getSpawnPose());
      return;
    }

    if (inputState.respawn) {
      this.vehicle.respawn(
        resolveRespawnPose(this.track.definition, this.lastCheckpointOrder)
      );
      this.activeCheckpointOrders = new Set<number>();
      this.activeBoostIds = new Set<string>();
    }
  }

  private persistBestLapIfNeeded(raceState: RaceState): void {
    if (raceState.phase === "finished" && this.lastPhase !== "finished" && raceState.bestMs !== null) {
      window.localStorage.setItem(BEST_LAP_STORAGE_KEY, Math.round(raceState.bestMs).toString());
    }

    this.lastPhase = raceState.phase;
  }
}
