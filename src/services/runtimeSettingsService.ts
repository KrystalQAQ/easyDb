import {
  listSettingsRaw,
  normalizeSettingKey,
  upsertSettingRaw,
  type RuntimeSettingRow,
} from "../repositories/runtimeSettingsRepository";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;

type RuntimeSettingDto = {
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function validateSettingKey(settingKey: string): string {
  const normalized = normalizeSettingKey(settingKey);
  if (!KEY_PATTERN.test(normalized)) {
    throw new Error("settingKey 格式不正确（需大写字母开头，仅允许 A-Z0-9_，长度 2-128）");
  }
  return normalized;
}

/**
 * 对仓储层记录做统一出参格式与脱敏处理。
 */
function formatSetting(
  row: RuntimeSettingRow,
  options: { includeSecret?: boolean } = {}
): RuntimeSettingDto {
  const includeSecret = Boolean(options.includeSecret);
  const isSecret = Boolean(row.is_secret);
  return {
    key: row.setting_key,
    value: isSecret && !includeSecret ? "***" : String(row.setting_value_text || ""),
    isSecret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRuntimeSettings(
  options: { includeSecret?: boolean; keyword?: string } = {}
): Promise<RuntimeSettingDto[]> {
  const rows = (await listSettingsRaw({ keyword: options.keyword })) as RuntimeSettingRow[];
  return rows.map((row) => formatSetting(row, options));
}

export async function upsertRuntimeSetting(
  settingKey: string,
  value: unknown,
  options: { isSecret?: boolean } = {}
): Promise<RuntimeSettingDto> {
  const normalizedKey = validateSettingKey(settingKey);
  const row = (await upsertSettingRaw(normalizedKey, value, {
    isSecret: options.isSecret,
  })) as RuntimeSettingRow | null;
  if (!row) {
    throw new Error("runtime setting write failed");
  }
  return formatSetting(row, { includeSecret: true });
}
