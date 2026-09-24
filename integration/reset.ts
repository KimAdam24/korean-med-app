import { configure } from '@testing-library/react-native';

import { camera } from './fakes/camera';
import { ocr, picker } from './fakes/devices';
import { disk } from './fakes/file-system';
import { biometrics } from './fakes/local-authentication';
import { keychain } from './fakes/secure-store';

/**
 * Five seconds, not the default one, for text to appear. A precaution, not a
 * fix: the first render in each app-level suite takes 700–770 ms against the
 * default's 1,000, the only tests that close. It did not explain the one
 * unexplained failure — see "An integration run failed once" in the README —
 * which the old timeout never reproduced. A real failure still fails.
 */
configure({ asyncUtilTimeout: 5000 });

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
