import { matchMaker } from '@colyseus/core';
import type { RoomListing } from '@kartishki/shared';

/** Custom Battlegrounds rooms as the server browser shows them (see AutoBattlerRoom.syncListing for the source fields). */
export async function listCustomRooms(): Promise<RoomListing[]> {
  const rooms = await matchMaker.query({ name: 'autoBattler' });
  return rooms.filter(room => room.metadata?.mode === 'custom' && room.metadata?.status !== 'finished').map(room => {
    const m = room.metadata as Record<string, unknown>;
    const num = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    const str = (v: unknown) => typeof v === 'string' ? v : '';
    return {
      roomId: room.roomId, name: str(m.name), host: str(m.host), players: num(m.players, room.clients), maxPlayers: num(m.maxPlayers, room.maxClients),
      bots: num(m.bots), setId: str(m.set), anomaly: str(m.anomaly), anomalySetting: str(m.anomalySetting) || 'random', timer: num(m.timer, 60),
      status: m.status === 'playing' ? 'playing' : 'waiting', joinable: !room.locked && m.status === 'waiting' && num(m.players) + num(m.bots) < num(m.maxPlayers, room.maxClients),
    };
  });
}
