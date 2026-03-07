const { dbClient } = require("../db");
const { SETTINGS_TABLE } = require("../runtimeSettings");

export interface RuntimeSettingRow {
  setting_key: string;
  setting_value_text: string;
  is_secret: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export function normalizeSettingKey(key: string): string {
  return String(key || "").trim().toUpperCase();
}

/**
 * 查询配置项原始记录；`setting_value_text` 保持原值，不做脱敏。
 */
export async function listSettingsRaw(options: { keyword?: string } = {}): Promise<RuntimeSettingRow[]> {
  const keyword = String(options.keyword || "").trim().toUpperCase();
  let query = dbClient(SETTINGS_TABLE)
    .select("setting_key", "setting_value_text", "is_secret", "created_at", "updated_at")
    .orderBy("setting_key", "asc");

  if (keyword) {
    query = query.where("setting_key", "like", `%${keyword}%`);
  }

  return query;
}

export async function getSettingRaw(settingKey: string): Promise<RuntimeSettingRow | null> {
  const key = normalizeSettingKey(settingKey);
  if (!key) return null;

  return dbClient(SETTINGS_TABLE)
    .select("setting_key", "setting_value_text", "is_secret", "created_at", "updated_at")
    .where({ setting_key: key })
    .first();
}

/**
 * 幂等写入配置；若 key 不存在则插入，存在则更新。
 */
export async function upsertSettingRaw(
  settingKey: string,
  value: unknown,
  options: { isSecret?: boolean } = {}
): Promise<RuntimeSettingRow | null> {
  const key = normalizeSettingKey(settingKey);
  if (!key) {
    throw new Error("settingKey is required");
  }

  const existing = await getSettingRaw(key);
  const isSecret =
    options.isSecret === undefined
      ? Boolean(existing?.is_secret)
      : Boolean(options.isSecret);

  const row = {
    setting_key: key,
    setting_value_text: String(value === undefined || value === null ? "" : value),
    is_secret: isSecret,
    updated_at: dbClient.fn.now(),
  };

  if (existing) {
    await dbClient(SETTINGS_TABLE)
      .where({ setting_key: key })
      .update(row);
  } else {
    await dbClient(SETTINGS_TABLE).insert({
      ...row,
      created_at: dbClient.fn.now(),
    });
  }

  return getSettingRaw(key);
}
