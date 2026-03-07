#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import FormData from 'form-data';

const execAsync = promisify(exec);

const server = new Server(
  {
    name: 'easydb-deploy',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 构建前端
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'build_frontend') {
    const args = z.object({
      projectKey: z.string().optional().describe('项目标识，默认为 default'),
      env: z.string().optional().describe('环境标识，默认为 prod'),
    }).parse(request.params.arguments || {});

    try {
      const { stdout, stderr } = await execAsync('pnpm --dir frontend-app build', {
        cwd: path.resolve(process.cwd()),
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ 前端构建成功\n\n输出:\n${stdout}\n${stderr || ''}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ 构建失败: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  // 打包并上传前端产物
  if (request.params.name === 'upload_frontend') {
    const args = z.object({
      projectKey: z.string().default('default').describe('项目标识'),
      env: z.string().default('prod').describe('环境标识'),
      apiUrl: z.string().default('http://localhost:3000').describe('API 地址'),
      token: z.string().describe('JWT Token'),
    }).parse(request.params.arguments || {});

    try {
      const distPath = path.resolve(process.cwd(), 'frontend-app/dist');
      const tmpDir = path.resolve(process.cwd(), 'runtime/tmp');
      await fs.mkdir(tmpDir, { recursive: true });

      const zipPath = path.join(tmpDir, `${args.projectKey}_${args.env}_${Date.now()}.zip`);
      const zip = new AdmZip();
      zip.addLocalFolder(distPath);
      zip.writeZip(zipPath);

      const form = new FormData();
      form.append('file', await fs.readFile(zipPath), {
        filename: path.basename(zipPath),
        contentType: 'application/zip',
      });

      const response = await fetch(
        `${args.apiUrl}/api/v2/projects/${args.projectKey}/envs/${args.env}/deploy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${args.token}`,
            ...form.getHeaders(),
          },
          body: form,
        }
      );

      const result = await response.json();
      await fs.unlink(zipPath).catch(() => {});

      if (!result.ok) {
        throw new Error(result.error || '上传失败');
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ 上传成功\n\n项目: ${args.projectKey}\n环境: ${args.env}\n目标: ${result.targetDir}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ 上传失败: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }


  // 一键发布（构建+打包+上传）
  if (request.params.name === 'publish_frontend') {
    const args = z.object({
      projectKey: z.string().default('default').describe('项目标识'),
      env: z.string().default('prod').describe('环境标识'),
      apiUrl: z.string().default('http://localhost:3000').describe('API 地址'),
      token: z.string().describe('JWT Token'),
    }).parse(request.params.arguments || {});

    const results = [];

    try {
      results.push('🔨 构建中...');
      await execAsync('pnpm --dir frontend-app build', { cwd: process.cwd() });
      results.push('✅ 构建完成');

      results.push('\n📦 打包上传中...');
      const distPath = path.resolve(process.cwd(), 'frontend-app/dist');
      const tmpDir = path.resolve(process.cwd(), 'runtime/tmp');
      await fs.mkdir(tmpDir, { recursive: true });

      const zipPath = path.join(tmpDir, `${args.projectKey}_${args.env}_${Date.now()}.zip`);
      const zip = new AdmZip();
      zip.addLocalFolder(distPath);
      zip.writeZip(zipPath);

      const form = new FormData();
      form.append('file', await fs.readFile(zipPath), {
        filename: path.basename(zipPath),
        contentType: 'application/zip',
      });

      const response = await fetch(
        `${args.apiUrl}/api/v2/projects/${args.projectKey}/envs/${args.env}/deploy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${args.token}`,
            ...form.getHeaders(),
          },
          body: form,
        }
      );

      const result = await response.json();
      await fs.unlink(zipPath).catch(() => {});

      if (!result.ok) {
        throw new Error(result.error || '上传失败');
      }

      results.push(`✅ 部署完成: ${result.targetDir}`);

      return {
        content: [
          {
            type: 'text',
            text: results.join('\n') + '\n\n🎉 发布成功！',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: results.join('\n') + `\n\n❌ 发布失败: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// 注册工具列表
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'build_frontend',
        description: '构建前端项目（运行 pnpm build）',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: {
              type: 'string',
              description: '项目标识，默认为 default',
            },
            env: {
              type: 'string',
              description: '环境标识，默认为 prod',
            },
          },
        },
      },
      {
        name: 'upload_frontend',
        description: '打包并上传前端产物到服务器',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: {
              type: 'string',
              description: '项目标识',
              default: 'default',
            },
            env: {
              type: 'string',
              description: '环境标识',
              default: 'prod',
            },
            apiUrl: {
              type: 'string',
              description: 'API 地址',
              default: 'http://localhost:3000',
            },
            token: {
              type: 'string',
              description: 'JWT Token',
            },
          },
          required: ['projectKey', 'env', 'token'],
        },
      },
      {
        name: 'publish_frontend',
        description: '一键发布：构建 → 打包 → 上传',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: {
              type: 'string',
              description: '项目标识',
              default: 'default',
            },
            env: {
              type: 'string',
              description: '环境标识',
              default: 'prod',
            },
            apiUrl: {
              type: 'string',
              description: 'API 地址',
              default: 'http://localhost:3000',
            },
            token: {
              type: 'string',
              description: 'JWT Token',
            },
          },
          required: ['projectKey', 'env', 'token'],
        },
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('EasyDB Deploy MCP Server running on stdio');
}

main().catch(console.error);

export {};
