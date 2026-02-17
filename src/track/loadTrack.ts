import rawPremiumTrack from "./data/premium-track.json";
import { TrackDefinition } from "../types";
import { validateTrackDefinition } from "./validateTrack";

export function loadPremiumTrack(): TrackDefinition {
  const clonedTrack = JSON.parse(JSON.stringify(rawPremiumTrack)) as TrackDefinition;
  return validateTrackDefinition(clonedTrack);
}
