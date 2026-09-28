/**
 * The photo guarantee end to end: a photograph of a label is read and then
 * gone, whichever way reading goes — or the app says it could not be deleted.
 */
import type { CameraView } from 'expo-camera';

import { disk } from './fakes/file-system';

import { discardPickedCopy, isPickedCopy, sweepPhotoCaches } from '@/features/capture/photo-caches';
import {
  CaptureFailedError,
  PhotoNotDiscardedError,
  withTransientCapture,
} from '@/features/capture/transient-capture';

/** The one method the capture path calls, as the real `CameraView` has it. */
function cameraThatShoots(uri: string | null): CameraView {
  return {
    takePictureAsync: async () => {
      if (uri === null) return undefined;
      disk.write(uri, 'jpeg-bytes');
      return { uri, width: 3000, height: 4000, format: 'jpg' };
    },
  } as unknown as CameraView;
}

const SHOT = 'file:///cache/Camera/shot.jpg';

describe('a camera capture', () => {
  it('exists while it is read, and is deleted as soon as reading is done', async () => {
    let seenDuringRead = false;
    const result = await withTransientCapture(cameraThatShoots(SHOT), async (image) => {
      seenDuringRead = disk.files.has(image.uri);
      return 'read';
    });

    expect(result).toBe('read');
    expect(seenDuringRead).toBe(true);
    expect(disk.files.has(SHOT)).toBe(false);
  });

  it('is deleted when reading fails, and the failure still reaches the caller', async () => {
    await expect(
      withTransientCapture(cameraThatShoots(SHOT), async () => {
        throw new Error('engine crashed');
      })
    ).rejects.toThrow('engine crashed');
    expect(disk.files.has(SHOT)).toBe(false);
  });

  it('is reported, never hidden, when it cannot be deleted', async () => {
    disk.failDeletes('file:///cache/Camera/');
    await expect(withTransientCapture(cameraThatShoots(SHOT), async () => 'read')).rejects.toBeInstanceOf(
      PhotoNotDiscardedError
    );
    expect(disk.files.has(SHOT)).toBe(true);
  });

  it('is reported when the camera hands back no photo at all', async () => {
    await expect(withTransientCapture(cameraThatShoots(null), async () => 'read')).rejects.toBeInstanceOf(
      CaptureFailedError
    );
  });
});

describe("the picker's copy of a chosen photo", () => {
  it('is deleted once read', () => {
    const copy = 'file:///cache/ImagePicker/label.jpg';
    disk.write(copy);
    discardPickedCopy(copy);
    expect(disk.files.has(copy)).toBe(false);
  });

  it('is the only thing that may be deleted — never a file the app did not make', () => {
    const elsewhere = 'file:///document/My Photos/label.jpg';
    disk.write(elsewhere);
    discardPickedCopy(elsewhere);
    expect(disk.files.has(elsewhere)).toBe(true);
  });

  it('is told apart from an address that only mentions the folder, or steps out of it', () => {
    expect(isPickedCopy('file:///cache/ImagePicker/label.jpg')).toBe(true);
    // Out of the folder, plainly or encoded.
    expect(isPickedCopy('file:///cache/ImagePicker/../../document/secure/vault.v1.bin')).toBe(false);
    expect(isPickedCopy('file:///cache/ImagePicker/%2E%2E/%2E%2E/document/secure/vault.v1.bin')).toBe(false);
    // The folder's name somewhere other than the start of the path.
    expect(isPickedCopy('file:///document/secure/vault.v1.bin#/cache/ImagePicker/x.jpg')).toBe(false);
    expect(isPickedCopy('file:///document/secure/vault.v1.bin?/cache/ImagePicker/x.jpg')).toBe(false);
    // The folder itself, or something inside a folder within it.
    expect(isPickedCopy('file:///cache/ImagePicker/')).toBe(false);
    expect(isPickedCopy('file:///cache/ImagePicker/nested/x.jpg')).toBe(false);
  });

  it('is reported when it cannot be deleted', () => {
    const copy = 'file:///cache/ImagePicker/label.jpg';
    disk.write(copy);
    disk.failDeletes('file:///cache/ImagePicker/');
    expect(() => discardPickedCopy(copy)).toThrow(PhotoNotDiscardedError);
  });
});

describe('the launch sweep', () => {
  it('empties both photo caches and nothing else', () => {
    disk.write('file:///cache/Camera/left-by-a-crash.jpg');
    disk.write('file:///cache/ImagePicker/left-by-a-crash.jpg');
    disk.write('file:///cache/other/keep.bin');
    disk.write('file:///document/secure/vault.v1.bin');

    sweepPhotoCaches();

    expect(disk.under('file:///cache/Camera/')).toEqual([]);
    expect(disk.under('file:///cache/ImagePicker/')).toEqual([]);
    expect(disk.files.has('file:///cache/other/keep.bin')).toBe(true);
    expect(disk.files.has('file:///document/secure/vault.v1.bin')).toBe(true);
  });

  it('does not stop a launch when a file will not go', () => {
    disk.write('file:///cache/Camera/stuck.jpg');
    disk.failDeletes('file:///cache/Camera/');
    expect(() => sweepPhotoCaches()).not.toThrow();
  });
});
