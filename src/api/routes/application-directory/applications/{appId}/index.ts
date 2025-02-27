import { Resource } from "express-automatic-routes";
import { Response } from "express";
import { FullDiscoveryBot } from "../../../../../common/sparkle/schemas/AppDirectory/bots";
import { fromSnowflake } from "../../../../../common/models/util";
import { HTTPError } from "../../../../../common/utils";
import { FullDiscoverableBot } from "../../../../../common/models/models/discovery/index";

// FIXME
export default () => <Resource> {
  get: async (req, res: Response<FullDiscoveryBot>) => {
    if (!req.params.appId) throw new HTTPError("Invalid appid");

    const rvId = await fromSnowflake(req.params.appId);

    const rvBot = await res.rvAPIWrapper.users.fetch(rvId);
    const rvBotProfile = await res.rvAPIWrapper.users.getProfile(rvId);

    const bot = await FullDiscoverableBot.from_quark({
      ...rvBot.revolt,
      tags: ["fixme"],
      usage: "high",
      servers: 0,
      avatar: rvBot.revolt.avatar ? {
        _id: rvBot.revolt.avatar._id,
        tag: rvBot.revolt.avatar.tag,
        filename: rvBot.revolt.avatar.filename,
        content_type: rvBot.revolt.avatar.content_type,
        metadata: {
          type: "image",
          width: 256,
          height: 256,
        },
        size: rvBot.revolt.avatar.size,
      } : null,
      profile: rvBotProfile ? {
        content: rvBotProfile.content ?? null,
      } : null,
    });

    res.json(bot);
  },
};
