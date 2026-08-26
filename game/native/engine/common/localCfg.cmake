# ============================================================================
# localCfg.cmake
# Local developer overrides for the CMake build.
#
# This file is git-ignored (see .gitignore) so each developer can customise
# paths and options without affecting other contributors or CI.
#
# Examples:
#   set(NODE_EXECUTABLE /opt/node-v18/bin/node)
#   set(COCOS_X_PATH /home/dev/cocos-engine/native)
#   option(USE_V8_DEBUGGER "Enable V8 inspector" ON)
#
# This file is included AFTER cfg.cmake in common/CMakeLists.txt, so any
# variable set here will override the exported defaults.
# ============================================================================

## Add or overwrite options from cfg.cmake.
## This file is ignored from git.
# set(NODE_EXECUTABLE /opt/...)
