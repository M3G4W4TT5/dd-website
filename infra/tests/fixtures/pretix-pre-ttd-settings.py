"""Hosted override for the pinned image; no request/message/exception contents."""
import logging
import logging.config
import re
import socket
from celery.signals import setup_logging

from pretix.settings import *  # noqa: F403
from pretix.helpers.apps import PretixHelpersConfig

STORAGES['staticfiles']['BACKEND'] = 'django.contrib.staticfiles.storage.ManifestStaticFilesStorage'

# Keep the pinned image's private-network protection active. Its urllib3 hook
# checks the resolved socket address at connect time; allow only the unpublished
# proxy webhook listener, whose sole route authenticates booking notifications.
ALLOW_HTTP_TO_PRIVATE_NETWORKS = False


class HostedPretixHelpersConfig(PretixHelpersConfig):
    def ready(self):
        # Import after Django populates apps: importing Pretix's monkeypatching
        # module while settings load imports models before the app registry exists.
        from pretix.helpers import monkeypatching
        upstream_should_block_access = monkeypatching.should_block_access

        def booking_webhook_private_access(address):
            host, port = address[:2]
            if port == 8081:
                try:
                    proxy_ips = {info[4][0] for info in socket.getaddrinfo('proxy', 8081,
                                 type=socket.SOCK_STREAM)}
                except OSError:
                    proxy_ips = set()
                if host in proxy_ips:
                    return False, ''
            return upstream_should_block_access(address)

        monkeypatching.should_block_access = booking_webhook_private_access
        super().ready()


INSTALLED_APPS[INSTALLED_APPS.index('pretix.helpers')] = 'production_settings.HostedPretixHelpersConfig'


class PrivateFormatter(logging.Formatter):
    def format(self, record):
        name = re.sub(r'[^a-zA-Z0-9_.-]', '_', record.name)[:128]
        kind = record.exc_info[0].__name__ if record.exc_info else ''
        return f'{record.levelname} {name}' + (f' [{kind}]' if kind else '')


LOGGING = {
    'version': 1, 'disable_existing_loggers': False,
    'formatters': {'private': {'()': PrivateFormatter}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'private'}},
    'root': {'handlers': ['console'], 'level': 'WARNING'},
    'loggers': {name: {'handlers': ['console'], 'level': 'WARNING', 'propagate': False}
                for name in ('pretix', 'django', 'django.request', 'django.server',
                             'django.security', 'celery', 'celery.task', 'celery.redirected',
                             'multiprocessing')},
}


@setup_logging.connect(weak=False)
def configure_celery_logging(**kwargs):
    # Celery otherwise installs formatters that include task arguments/tracebacks.
    logging.config.dictConfig(LOGGING)
