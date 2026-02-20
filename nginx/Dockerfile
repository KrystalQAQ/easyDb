FROM nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY runtime/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf
COPY frontend-app/dist/ /usr/share/nginx/html/
