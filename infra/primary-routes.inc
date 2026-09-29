limit_except POST { deny all; }
proxy_pass http://primary-communications:3011;
proxy_connect_timeout 3s;
proxy_read_timeout 15s;
proxy_pass_request_headers off;
proxy_set_header Host forms.didde-mie.com;
proxy_set_header Content-Type application/json;
proxy_set_header Origin $http_origin;
proxy_set_header X-DD-Visitor-IP $http_x_dd_visitor_ip;
proxy_set_header X-DD-Proxy-Time $http_x_dd_proxy_time;
proxy_set_header X-DD-Proxy-Signature $http_x_dd_proxy_signature;
