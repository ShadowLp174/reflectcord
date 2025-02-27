import { APIApplication } from "discord.js";
import { Application, Response } from "express";
import { Resource } from "express-automatic-routes";
import { API } from "revolt.js";
import { Application as botApplication, OwnedApplication } from "../../../common/models";

export default (express: Application) => <Resource> {
  get: async (req, res) => {
    const api = res.rvAPI;

    const revoltBots = await api.get("/bots/@me") as API.OwnedBotsResponse;

    const ownedRevoltBots: API.BotResponse[] = revoltBots.bots.map((bot) => {
      const user = revoltBots.users.find((u) => u._id === bot._id)!;

      return {
        bot,
        user,
      };
    });

    const discordBots = await Promise.all(ownedRevoltBots
      .map((bot) => OwnedApplication.from_quark(bot)));

    return res.json(discordBots);
  },
  post: async (req, res: Response<APIApplication>) => {
    const { name } = req.body;
    if (!name) {
      return res.status(504).json({
        // @ts-ignore
        code: 504,
        message: "You must set a name for your bot!",
      });
    }
    const api = res.rvAPI;

    const bot = await api.post("/bots/create", {
      name,
    }).catch(() => {
      res.status(500).json({
        // @ts-ignore
        code: 500,
        message: "Revolt could not create bot",
      });
    }) as API.Bot;
    if (!bot) return;

    return res.json(await botApplication.from_quark(bot));
  },
};
