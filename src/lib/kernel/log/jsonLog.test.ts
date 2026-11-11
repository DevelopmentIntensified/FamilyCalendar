import { describe, expect, it } from 'vitest';
import { fixedClock } from '../time/clock';
import { createJsonLog, type LogLevel } from './jsonLog';

describe('createJsonLog', () => {
	it('writes one JSON line per call in the legacy {ts, level, event, ...fields} shape', () => {
		const lines: Array<[LogLevel, string]> = [];
		const log = createJsonLog(fixedClock('2026-05-01T08:00:00Z'), (level, line) =>
			lines.push([level, line])
		);

		log.info('pricing_view', { plan: 'family' });
		log.error('endpoint_fault', { path: '/api/tasks', status: 500 });

		expect(lines.map(([level]) => level)).toEqual(['info', 'error']);
		expect(JSON.parse(lines[0][1])).toEqual({
			ts: '2026-05-01T08:00:00.000Z',
			level: 'info',
			event: 'pricing_view',
			plan: 'family'
		});
		expect(JSON.parse(lines[1][1])).toMatchObject({ event: 'endpoint_fault', status: 500 });
	});
});
