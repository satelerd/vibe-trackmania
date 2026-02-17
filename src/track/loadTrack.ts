import rawPremiumTrack from "./data/premium-track.json";
import { TrackDefinition } from "../types";
import { validateTrackDefinition } from "./validateTrack";

export function loadPremiumTrack(): TrackDefinition {
  return validateTrackDefinition(rawPremiumTrack as TrackDefinition);
}
