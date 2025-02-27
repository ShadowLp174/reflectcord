import { WebSocket } from "../Socket";
import { Payload } from "../util";
import { onHeartbeat } from "./Heartbeat";
import { onIdentify } from "./Identify";
import { lazyReq } from "./lazyReq";
import { presenceUpdate } from "./PresenceUpdate";
import { RequestGuildMembers } from "./RequestGuildMembers";
import { onResume } from "./Resume";
import { VSUpdate } from "./VS";
import { GatewayOpcodes } from "../../common/sparkle";
import { QueryApplicationCommands } from "./QueryApplicationCommands";

export type OPCodeHandler = (this: WebSocket, data: Payload) => any;

export const OPCodeHandlers: { [key: number ]: OPCodeHandler } = {
  [GatewayOpcodes.Heartbeat]: onHeartbeat,
  [GatewayOpcodes.Identify]: onIdentify,
  [GatewayOpcodes.PresenceUpdate]: presenceUpdate,
  [GatewayOpcodes.Resume]: onResume,
  [GatewayOpcodes.VoiceStateUpdate]: VSUpdate,
  [GatewayOpcodes.RequestGuildMembers]: RequestGuildMembers,
  [GatewayOpcodes.LazyRequest]: lazyReq,
  [GatewayOpcodes.QueryApplicationCommands]: QueryApplicationCommands,
};
