const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSlots, expandSlots } = require('../src/renderer/plan-times.js');
const slot = (startTime,endTime,endNextDay=false) => ({startTime,endTime,endNextDay});

test('fixed slots sort without mutating input and allow touching intervals and address-only plans', () => {
  const input = [slot('12:20','13:30'),slot('10:50','11:30'),slot('11:30','12:20')];
  assert.deepEqual(validateSlots(input).map(s=>s.startTime),['10:50','11:30','12:20']);
  assert.equal(input[0].startTime,'12:20');
  assert.deepEqual(validateSlots(),[]);
});

test('fixed slots reject malformed, overlapping, reversed or overlong ranges', () => {
  for (const slots of [null,{},[slot('24:00','13:00')],[slot('1:00','02:00')],[slot('10:00','10:00')],[slot('11:30','10:50')],[slot('10:00','11:00',true)],[slot('10:00','12:00'),slot('11:00','13:00')],[slot('23:00','01:00',true),slot('23:30','23:50')],Array(51).fill(slot('10:00','11:00'))]) assert.throws(()=>validateSlots(slots));
});

test('a single local date expands all slots and next-day times cross months and leap years', () => {
  const windows = expandSlots([slot('10:50','11:30'),slot('12:20','13:30'),slot('23:00','01:00',true)],'2028-02-29');
  for (const window of windows) {
    const start = new Date(window.startAt);
    assert.equal(start.getFullYear(),2028); assert.equal(start.getMonth(),1); assert.equal(start.getDate(),29);
  }
  const end = new Date(windows[2].endAt);
  assert.equal(end.getMonth(),2); assert.equal(end.getDate(),1); assert.equal(end.getHours(),1);
  assert.equal(new Date(windows[0].startAt).getHours(),10);
  assert.equal(new Date(windows[0].startAt).getMinutes(),50);
  const yearEnd = expandSlots([slot('23:00','00:30',true)],'2026-12-31');
  assert.equal(new Date(yearEnd[0].endAt).getFullYear(),2027);
  for (const date of ['', '2027-02-29','2026-13-01','2026-04-31']) assert.throws(()=>expandSlots([slot('10:00','11:00')],date));
});
