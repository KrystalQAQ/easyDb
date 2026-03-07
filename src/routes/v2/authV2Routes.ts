import { Router, type Response } from "express";
import type { PlatformRequest } from "../platform/types";
const { authenticate, authorize, exchangeToken, login } = require("../../auth");
const { getUserDetail, updateAvatar } = require("../../userStore");

/**
 * v2 鉴权路由：统一返回结构并保留 v1 能力。
 */
export function createAuthV2Routes() {
  const router = Router();

  router.post("/login", login);
  router.post("/authorize", authorize);
  router.post("/token", exchangeToken);

  router.get("/me", authenticate, async (req: PlatformRequest, res: Response) => {
    try {
      const username = req.user?.username || "";
      const fallbackUser = req.user || { username, role: "" };
      const detail = await getUserDetail(username);
      const user = {
        ...fallbackUser,
        avatar: detail?.avatar || null,
      };
      return res.json({
        ok: true,
        user,
        data: {
          user,
        },
      });
    } catch (_err: unknown) {
      const user = req.user || { username: "", role: "" };
      return res.json({
        ok: true,
        user,
        data: { user },
      });
    }
  });

  router.put("/me/avatar", authenticate, async (req: PlatformRequest, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    const avatar = payload.avatar;
    if (!avatar || typeof avatar !== "string") {
      return res.status(400).json({ ok: false, error: "avatar 不能为空" });
    }
    if (!avatar.startsWith("data:image/")) {
      return res.status(400).json({ ok: false, error: "avatar 必须是 data URL 格式" });
    }
    if (avatar.length > 1400000) {
      return res.status(400).json({ ok: false, error: "头像文件过大，请压缩后重试" });
    }
    try {
      const username = req.user?.username || "";
      await updateAvatar(username, avatar);
      return res.json({ ok: true });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: errorMessage });
    }
  });

  return router;
}
