# NOT LINKED. This pod is written but never built: it cannot be compiled on
# the Windows machine the project is developed on, and an uncompiled Swift
# file in a linked module would break every iOS build. The module's
# expo-module.config.json lists Android only. See ../README.md.
Pod::Spec.new do |s|
  s.name           = 'LabelSweep'
  s.version        = '0.1.0'
  s.summary        = 'Reads a medication label from the camera analysis stream while the bottle turns.'
  s.description    = 'A viewfinder that runs Vision text recognition on live frames, inside native code, and sends only recognised lines to JavaScript.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
