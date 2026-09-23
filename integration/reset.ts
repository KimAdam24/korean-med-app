import { camera } from './fakes/camera';
import { ocr, picker } from './fakes/devices';
import { disk } from './fakes/file-system';
import { biometrics } from './fakes/local-authentication';
import { keychain } from './fakes/secure-store';

/**
 * Every test starts on a phone fresh from the box: an empty keychain and disk,
 * a phone lock with a fingerprint enrolled, camera permission granted, nothing
 * to read and nothing picked.
 */
beforeEach(() => {
  keychain.reset();
  disk.reset();
  biometrics.reset();
  camera.reset();
  picker.reset();
  ocr.reset();
});
