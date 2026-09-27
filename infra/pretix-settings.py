"""Hosted override for the pinned image; no request/message/exception contents."""
import logging
import logging.config
import re
from celery.signals import setup_logging

from pretix.settings import *  # noqa: F403

STORAGES['staticfiles']['BACKEND'] = 'django.contrib.staticfiles.storage.ManifestStaticFilesStorage'


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
