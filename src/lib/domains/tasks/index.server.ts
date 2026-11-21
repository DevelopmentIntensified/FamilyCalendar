/**
 * tasks — public server interface: services and http handlers.
 *
 * Only the guest merge's mover is exported from here so far: `access`' guest
 * merge calls it inside its own transaction. The rest of the module's entry
 * lands with its S5/S6 port.
 *
 * Doc: ./README.md#public-interface
 */
export { moveGuestTasks, countGuestTasks, type MoveGuestTasksInput } from './tasks.guest.service.server';
