#!/usr/bin/env node
/**
 * 生成一个安全的 JWT_SECRET 随机字符串
 * 用法: node scripts/generate-jwt-secret.js
 */

const crypto = require('crypto')

const secret = crypto.randomBytes(48).toString('base64url')

console.log('生成的 JWT_SECRET：')
console.log()
console.log(secret)
console.log()
console.log('请将以下内容更新到 .env 文件：')
console.log(`JWT_SECRET=${secret}`)
