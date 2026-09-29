import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, freshSave, hasSave, LEGACY, loadSave, rankFor, recordInstant, recordMission, recordTip, recordTraining, SAVE_KEY, storeSave, unlockedFor, withDeviceDefaults } from './campaign';
import { memoryStorage, type KeyValue } from './storage';

describe('campaign save (02 2.5)', () => {
  it('saves and loads missions, training, instant best and settings', () => {
    const store = memoryStorage();
    let s = freshSave();
    s = recordMission(s, 'm01', true, 2400, 'A').save;
    s = recordTraining(s, 't3');
    s = recordInstant(s, 1800, 'B').save;
    s = { ...s, settings: { ...s.settings, difficulty: 'hard', voiceWarnings: false } };
    storeSave(s, store);
    const back = loadSave(store);
    expect(back).toEqual(s);
    expect(back.totalScore).toBe(2400);
  });

  it('keeps the best score and grade, and only marks completion on success', () => {
    let s = freshSave();
    let r = recordMission(s, 'm02', false, 900, 'F');
    expect(r.save.missions.m02).toEqual({ completed: false, bestScore: 0, bestGrade: null });
    s = recordMission(r.save, 'm02', true, 1500, 'B').save;
    r = recordMission(s, 'm02', true, 1200, 'C');
    expect(r.newBest).toBe(false);
    expect(r.save.missions.m02).toEqual({ completed: true, bestScore: 1500, bestGrade: 'B' });
    expect(recordMission(r.save, 'm02', true, 2600, 'S').save.missions.m02.bestGrade).toBe('S');
  });

  it('moves unreadable or unknown-version data to the backup key and starts fresh', () => {
    for (const bad of ['{not json', JSON.stringify({ version: 7, missions: {} }), 'null']) {
      const store = memoryStorage();
      store.setItem(SAVE_KEY, bad);
      const s = loadSave(store);
      expect(s).toEqual(freshSave());
      expect(store.getItem(BACKUP_KEY)).toBe(bad);
      expect(store.getItem(SAVE_KEY)).toBeNull();
    }
  });

  it('repairs damaged fields instead of throwing', () => {
    const store = memoryStorage();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, missions: { m01: { completed: 'yes', bestScore: 'lots', bestGrade: 'Z' }, m02: { completed: true, bestScore: 700, bestGrade: 'C' } }, training: { t1: true, t3: 1 }, settings: { difficulty: 'godlike', voiceWarnings: 'no' } }));
    const s = loadSave(store);
    expect(s.missions.m01).toEqual({ completed: false, bestScore: 0, bestGrade: null });
    expect(s.missions.m02.bestScore).toBe(700);
    expect(s.training).toEqual({ t1: true });
    expect(s.settings.difficulty).toBe('normal');
    expect(s.totalScore).toBe(700);
  });

  it('migrates the old per-feature keys', () => {
    const store = memoryStorage();
    store.setItem(LEGACY.training, JSON.stringify(['t1', 't4']));
    store.setItem(LEGACY.difficulty, 'easy');
    store.setItem(LEGACY.voice, 'off');
    store.setItem(LEGACY.instant, JSON.stringify({ score: 999, grade: 'C' }));
    const s = loadSave(store);
    expect(s.training).toEqual({ t1: true, t4: true });
    expect(s.settings).toMatchObject({ difficulty: 'easy', voiceWarnings: false });
    expect(s.instantBest).toEqual({ score: 999, grade: 'C' });
  });

  it('keeps working when localStorage throws', () => {
    const broken: KeyValue = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(loadSave(broken)).toEqual(freshSave());
    expect(storeSave(freshSave(), broken)).toBe(false);
    expect(loadSave(null)).toEqual(freshSave());
  });

  it('unlocks per the 2.5 table and ranks by total score', () => {
    let s = freshSave();
    expect(unlockedFor(s).size).toBe(0);
    for (const n of [1, 2, 3, 4]) s = recordMission(s, `m0${n}`, true, 5000, 'S').save;
    expect([...unlockedFor(s)]).toEqual(['chaff']);
    s = recordMission(s, 'm05', true, 5000, 'S').save;
    expect(unlockedFor(s).has('agm114l')).toBe(true);
    s = recordMission(s, 'm06', true, 5000, 'S').save;
    expect(unlockedFor(s).has('liveries')).toBe(true);
    expect(rankFor(0).id).toBe('secondLt');
    expect(rankFor(16000).id).toBe('captain');
    expect(rankFor(s.totalScore).id).toBe('major');
  });
});

describe('tips seen', () => {
  it('remembers each tip once and survives a reload', () => {
    const store = memoryStorage();
    let s = recordTip(freshSave(), 'rwr');
    s = recordTip(s, 'rwr');
    expect(s.tips).toEqual(['rwr']);
    storeSave(s, store);
    expect(loadSave(store).tips).toEqual(['rwr']);
  });
});

describe('settings (07 7.8)', () => {
  it('stores every settings group and clamps what it reads back', () => {
    const store = memoryStorage();
    const s = freshSave();
    s.settings.controls = { lookSensitivity: 1.6, invertLookY: true, tadsSensitivity: 0.6, touchStickSize: 'L' };
    s.settings.display = { fov: 84, ihadssBrightness: 0.7, quality: 'medium', showFps: true };
    s.settings.audio = { master: 0.4 };
    storeSave(s, store);
    expect(loadSave(store).settings).toEqual(s.settings);
    store.setItem(SAVE_KEY, JSON.stringify({ ...s, settings: { ...s.settings, controls: { lookSensitivity: 99, touchStickSize: 'XL' }, display: { fov: 10, quality: 'ultra' }, audio: { master: -3 } } }));
    const back = loadSave(store).settings;
    expect(back.controls).toEqual({ lookSensitivity: 2, invertLookY: false, tadsSensitivity: 1, touchStickSize: 'M' });
    expect(back.display).toMatchObject({ fov: 60, quality: 'high', showFps: false });
    expect(back.audio.master).toBe(0);
  });

  it('picks low quality for a phone on first run only', () => {
    const store = memoryStorage();
    expect(hasSave(store)).toBe(false);
    expect(withDeviceDefaults(freshSave(), { mobile: true }).settings.display.quality).toBe('low');
    expect(withDeviceDefaults(freshSave(), { mobile: false }).settings.display.quality).toBe('high');
    storeSave(freshSave(), store);
    expect(hasSave(store)).toBe(true);
  });
});
