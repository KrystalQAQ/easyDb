FROM nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY runtime/nginx/conf.d/00-log-format.conf /etc/nginx/conf.d/00-log-format.conf
COPY runtime/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
# 前端静态文件通过宿主机目录挂载，不打包进镜像
