import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, receive, editPost, transition, publishingTimestamp, dayKey, monthCells, restoreState } from '../src/campaigns/management/model';
test('campaign transfer deduplicates and preserves edits, but new creative requires review', () => {
  let state = seed(); const original = state.campaigns[0].campaign;
  state = receive(state, original);
  const post = state.posts.find(p => p.campaignId === original.id)!;
  state = editPost(state, post.id, 'Edited localized caption', post.scheduledAt);
  state = transition(state, original.id, 'APPROVED');
  state = receive(state, original);
  assert.equal(state.campaigns.length, 4);
  assert.equal(state.posts.find(p => p.id === post.id)?.caption, 'Edited localized caption');
  assert.equal(state.campaigns.find(c => c.campaign.id === original.id)?.status, 'APPROVED');
  state = receive(state, { ...original, caption: 'New AI creative' });
  assert.equal(state.campaigns.length, 4);
  assert.equal(state.campaigns[0].status, 'DRAFT');
  assert.equal(state.posts.find(p => p.id === post.id)?.caption, 'New AI creative');
});
test('approval is required before scheduling; editing copy invalidates scheduled campaign', () => {
  let state = seed(); const id = state.campaigns[0].campaign.id;
  assert.equal(transition(state, id, 'SCHEDULED'), state);
  assert.equal(state.posts.filter(p => p.schedulingStatus === 'SCHEDULED').length, 6);
  state = transition(state, id, 'APPROVED');
  assert.equal(state.posts.filter(p => p.schedulingStatus === 'SCHEDULED').length, 6);
  state = transition(state, id, 'SCHEDULED');
  assert.equal(state.posts.filter(p => p.schedulingStatus === 'SCHEDULED').length, 9);
  const post = state.posts.find(p => p.campaignId === id)!;
  state = editPost(state, post.id, post.caption, '2027-01-04T19:00:00+01:00');
  assert.equal(state.posts.find(p => p.id === post.id)?.schedulingStatus, 'SCHEDULED');
  state = editPost(state, post.id, 'A new caption', post.scheduledAt);
  assert.equal(state.posts.filter(p => p.schedulingStatus === 'SCHEDULED').length, 6);
  assert.equal(state.campaigns.find(c => c.campaign.id === id)?.status, 'DRAFT');
});
test('calendar alignment, leap years, Vienna day boundaries and daylight saving times', () => {
  assert.equal(monthCells('2027-02')[0], '2027-02-01');
  assert.equal(monthCells('2027-08').filter(day => day === null).length, 6);
  assert.equal(monthCells('2028-02').filter(Boolean).length, 29);
  assert.equal(dayKey('2027-06-01T22:30:00Z'), '2027-06-02');
  assert.equal(publishingTimestamp('2027-02-15T18:00'), '2027-02-15T18:00:00+01:00');
  assert.equal(publishingTimestamp('2027-07-15T18:00'), '2027-07-15T18:00:00+02:00');
  assert.equal(publishingTimestamp('2027-03-28T02:30'), null);
  assert.equal(publishingTimestamp('2027-02-30T18:00'), null);
});

test('stored campaign state survives JSON round trip and malformed storage is rejected', () => {
  const state = seed();
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state))), state);
  assert.equal(restoreState({ campaigns: [{ status: 'DRAFT' }], posts: [] }), null);
  const invalid = JSON.parse(JSON.stringify(state)); invalid.posts[0].scheduledAt = 'not a date';
  assert.equal(restoreState(invalid), null);
  assert.equal(restoreState({ ...state, posts: [...state.posts, state.posts[0]] }), null);
});
