"""Chat channels module with plugin architecture."""

from guide_cortex.channels.base import BaseChannel
from guide_cortex.channels.manager import ChannelManager

__all__ = ["BaseChannel", "ChannelManager"]
