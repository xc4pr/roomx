from .config import Config
from .server import create_app

app = create_app(Config.from_env())
