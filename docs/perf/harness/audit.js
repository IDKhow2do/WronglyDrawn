(async () => { const r = await T.touchAudit(); return { nChanged: r.changed.length, leaks: r.leaks, sample: r.changed.map(x => x[1] + '  ⟸  ' + x[0]) }; })()
