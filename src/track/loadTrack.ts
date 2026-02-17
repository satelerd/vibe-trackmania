import { premiumTrackDefinition } from "./data/premium-track";
import { TrackDefinition } from "../types";
import { validateTrackDefinition } from "./validateTrack";

export function loadPremiumTrack(): TrackDefinition {
  const clonedTrack = JSON.parse(JSON.stringify(premiumTrackDefinition)) as TrackDefinition;
  return validateTrackDefinition(clonedTrack);
}
