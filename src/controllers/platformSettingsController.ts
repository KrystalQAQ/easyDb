import type { Response } from "express";
import type { PlatformRequest } from "../routes/platform/types";
import { listRuntimeSettings, upsertRuntimeSetting } from "../services/runtimeSettingsService";

const { writeAuditLog } = require("../auditLogger");
const { parseAdminPayload } = require("../http/adminCommon");

/**
 * 返回运行配置列表（支持关键字过滤与密文显示开关）。
 */
export async function listPlatformSettings(req: PlatformRequest, res: Response) {
  const includeSecret = String(req.query.includeSecret || "").toLowerCase() === "true";
  const keyword = String(req.query.keyword || "").trim();
  try {
    const items = await listRuntimeSettings({ includeSecret, keyword });
    return res.json({
      ok: true,
      items,
      note: "修改后对新请求生效可能依赖进程重启，建议保存后执行重启",
    });
  } catch (err: unknown) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * 更新单个运行配置，写审计日志并返回脱敏结果。
 */
export async function upsertPlatformSetting(req: PlatformRequest, res: Response) {
  const payload = parseAdminPayload(req, res);
  if (!payload) return;
  if (!Object.prototype.hasOwnProperty.call(payload, "value")) {
    return res.status(400).json({ ok: false, error: "value 不能为空" });
  }
  const rawSettingKey = req.params.settingKey;
  const settingKey = Array.isArray(rawSettingKey) ? rawSettingKey[0] : String(rawSettingKey || "");

  try {
    const item = await upsertRuntimeSetting(settingKey, payload.value, {
      isSecret: payload.isSecret,
    });

    await writeAuditLog({
      endpoint: "/api/platform/settings/:settingKey",
      action: "upsert_runtime_setting",
      status: "ok",
      actor: req.user?.username || "unknown",
      role: req.user?.role || "unknown",
      targetSetting: item.key,
      isSecret: item.isSecret,
      ip: req.ip,
    });

    return res.json({
      ok: true,
      item: {
        key: item.key,
        value: item.isSecret ? "***" : item.value,
        isSecret: item.isSecret,
        updatedAt: item.updatedAt,
      },
      note: "配置已保存，建议重启网关进程以确保全部模块读取最新配置",
    });
  } catch (err: unknown) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
