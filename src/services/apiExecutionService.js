const crypto = require("crypto");
const { writeAuditLog } = require("../auditLogger");
const { getApi } = require("../apiStore");

// ---------------------------------------------------------------------------
// SQL 模板渲染：将命名参数 :paramName 转换为 ? 占位符 + 值数组
// ---------------------------------------------------------------------------

const NAMED_PARAM_RE = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

function renderSqlTemplate(template, params) {
  const values = [];
  const sql = template.replace(NAMED_PARAM_RE, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`缺少必要参数: ${name}`);
    }
    values.push(params[name]);
    return "?";
  });
  return { sql, values };
}

// ---------------------------------------------------------------------------
// 参数校验
// ---------------------------------------------------------------------------

function validateApiParams(rawParams, paramsSchema) {
  if (!Array.isArray(paramsSchema) || paramsSchema.length === 0) {
    return { ok: true, params: rawParams || {} };
  }

  const input = rawParams || {};
  const result = {};
  const errors = [];

  // 不允许传入未定义的参数
  const definedNames = new Set(paramsSchema.map((s) => s.name));
  for (const key of Object.keys(input)) {
    if (!definedNames.has(key)) {
      errors.push(`未定义的参数: ${key}`);
    }
  }

  for (const schema of paramsSchema) {
    const { name, type = "string", required, default: defaultValue } = schema;
    let value = input[name];

    if (value === undefined || value === null || value === "") {
      if (required) {
        errors.push(`参数 ${name} 是必填项`);
        continue;
      }
      if (defaultValue !== undefined) {
        value = defaultValue;
      } else {
        continue;
      }
    }

    // 类型转换和校验
    switch (type) {
      case "integer": {
        const num = Number(value);
        if (!Number.isFinite(num) || num !== Math.floor(num)) {
          errors.push(`参数 ${name} 必须是整数`);
          continue;
        }
        value = num;
        if (schema.min !== undefined && value < schema.min) {
          errors.push(`参数 ${name} 不能小于 ${schema.min}`);
          continue;
        }
        if (schema.max !== undefined && value > schema.max) {
          errors.push(`参数 ${name} 不能大于 ${schema.max}`);
          continue;
        }
        break;
      }
      case "number": {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          errors.push(`参数 ${name} 必须是数字`);
          continue;
        }
        value = num;
        if (schema.min !== undefined && value < schema.min) {
          errors.push(`参数 ${name} 不能小于 ${schema.min}`);
          continue;
        }
        if (schema.max !== undefined && value > schema.max) {
          errors.push(`参数 ${name} 不能大于 ${schema.max}`);
          continue;
        }
        break;
      }
      case "boolean": {
        if (typeof value === "string") {
          value = ["true", "1", "yes"].includes(value.toLowerCase());
        } else {
          value = Boolean(value);
        }
        break;
      }
      case "datetime": {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          errors.push(`参数 ${name} 日期格式无效`);
          continue;
        }
        value = String(value);
        break;
      }
      case "string":
      default: {
        value = String(value);
        const maxLength = schema.maxLength || 1000;
        if (value.length > maxLength) {
          errors.push(`参数 ${name} 长度不能超过 ${maxLength}`);
          continue;
        }
        if (Array.isArray(schema.enum) && schema.enum.length > 0 && !schema.enum.includes(value)) {
          errors.push(`参数 ${name} 的值必须是: ${schema.enum.join(", ")}`);
          continue;
        }
        break;
      }
    }

    result[name] = value;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, params: result };
}

// ---------------------------------------------------------------------------
// 结果映射
// ---------------------------------------------------------------------------

function applyResultMapping(rawResult, mapping) {
  if (!mapping) return rawResult;

  let data = rawResult;

  // 字段重命名
  if (mapping.fields && typeof mapping.fields === "object") {
    const remap = (row) => {
      const out = {};
      for (const [alias, col] of Object.entries(mapping.fields)) {
        out[alias] = row[col];
      }
      return out;
    };
    if (Array.isArray(data)) {
      data = data.map(remap);
    } else if (data && typeof data === "object") {
      data = remap(data);
    }
  }

  switch (mapping.type) {
    case "single":
      return Array.isArray(data) ? data[0] || null : data;
    case "scalar":
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        return first ? Object.values(first)[0] : null;
      }
      return null;
    case "list":
    default:
      return data;
  }
}

// ---------------------------------------------------------------------------
// 完整执行流程
// ---------------------------------------------------------------------------

async function executeApiRequest(req, res, options = {}) {
  const requestId = crypto.randomUUID();
  const startMs = Date.now();
  const actor = req.user?.username || "anonymous";
  const role = req.user?.role || "";
  const { projectEnvId, context, dbClient, apiKey } = options;

  const auditMeta = context
    ? { projectKey: context.projectKey, env: context.env, apiKey }
    : { apiKey };

  // 1. 查找接口定义
  const apiDef = await getApi(projectEnvId, apiKey);
  if (!apiDef) {
    return res.status(404).json({ ok: false, error: "接口不存在", requestId });
  }
  if (apiDef.status !== "active") {
    return res.status(403).json({ ok: false, error: "接口已禁用", requestId });
  }

  // 2. 鉴权模式检查（authMode=public 时已在路由层处理）

  // 3. 提取参数：GET 从 query，POST/PUT/DELETE 从 body.params
  const rawParams = req.method === "GET"
    ? { ...req.query }
    : (req.body?.params || {});

  // 4. 参数校验
  const validation = validateApiParams(rawParams, apiDef.paramsSchema);
  if (!validation.ok) {
    await writeAuditLog({
      requestId,
      endpoint: `/api/gw/:pk/:env/api/${apiKey}`,
      status: "blocked",
      actor,
      role,
      ip: req.ip,
      sqlType: apiDef.sqlType,
      error: validation.errors.join("; "),
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: validation.errors.join("; "), requestId });
  }

  // 5. SQL 模板渲染
  let sql, values;
  try {
    const rendered = renderSqlTemplate(apiDef.sqlTemplate, validation.params);
    sql = rendered.sql;
    values = rendered.values;
  } catch (err) {
    await writeAuditLog({
      requestId,
      endpoint: `/api/gw/:pk/:env/api/${apiKey}`,
      status: "blocked",
      actor,
      role,
      ip: req.ip,
      sqlType: apiDef.sqlType,
      error: err.message,
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: err.message, requestId });
  }

  // 6. 执行 SQL
  try {
    const [result] = await dbClient.raw(sql, values);
    const durationMs = Date.now() - startMs;

    await writeAuditLog({
      requestId,
      endpoint: `/api/gw/:pk/:env/api/${apiKey}`,
      status: "ok",
      actor,
      role,
      ip: req.ip,
      sqlType: apiDef.sqlType,
      sqlPreview: sql.slice(0, 500),
      paramsCount: values.length,
      rowCount: apiDef.sqlType === "select" && Array.isArray(result) ? result.length : undefined,
      affectedRows: apiDef.sqlType !== "select" ? result?.affectedRows || 0 : undefined,
      durationMs,
      ...auditMeta,
    });

    // 7. 结果映射
    const data = apiDef.sqlType === "select"
      ? applyResultMapping(result, apiDef.resultMapping)
      : result;

    if (apiDef.sqlType === "select") {
      return res.json({
        ok: true,
        requestId,
        apiKey,
        type: apiDef.sqlType,
        rowCount: Array.isArray(result) ? result.length : 0,
        data,
      });
    }

    return res.json({
      ok: true,
      requestId,
      apiKey,
      type: apiDef.sqlType,
      affectedRows: result?.affectedRows || 0,
      insertId: result?.insertId || null,
      data,
    });
  } catch (err) {
    await writeAuditLog({
      requestId,
      endpoint: `/api/gw/:pk/:env/api/${apiKey}`,
      status: "error",
      actor,
      role,
      ip: req.ip,
      sqlType: apiDef.sqlType,
      sqlPreview: sql.slice(0, 500),
      paramsCount: values.length,
      error: err.message,
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: err.message, requestId });
  }
}

module.exports = {
  renderSqlTemplate,
  validateApiParams,
  applyResultMapping,
  executeApiRequest,
};
