"""Message bus module for decoupled channel-agent communication."""

from guide_cortex.bus.events import InboundMessage, OutboundMessage
from guide_cortex.bus.queue import MessageBus

__all__ = ["MessageBus", "InboundMessage", "OutboundMessage"]
