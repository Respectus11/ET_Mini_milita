# ============================================================================
# common/CMakeLists.txt
# Shared CMake configuration for all native platforms (Android, iOS, macOS).
#
# This file is included by the platform-specific CMakeLists.txt (e.g. the
# android/ variant) and pulls in the Cocos Creator engine build, then appends
# the game-specific C++ sources (Game.h / Game.cpp) to the build.
# ============================================================================

# Enable C and Assembly languages (ASM is needed by some engine internals).
enable_language(C ASM)

# ---------------------------------------------------------------------------
# User-configurable cache variables — set these via cmake -D flags or a GUI.
# ---------------------------------------------------------------------------

# Apple Development Team ID (required for iOS / macOS code signing).
set(DEVELOPMENT_TEAM    ""  CACHE STRING "APPLE Developtment Team")

# Path to the exported Cocos Creator build output (assets, proj/cfg.cmake, etc.)
set(RES_DIR             ""  CACHE STRING "Resource path")

# Path to the engine's native/ directory (contains the core Cocos build system).
set(COCOS_X_PATH        ""  CACHE STRING "Path to engine/native/")

# Minimum OS version targets.
set(TARGET_OSX_VERSION "10.14" CACHE STRING "Target MacOSX version" FORCE)
set(TARGET_IOS_VERSION "11.0"  CACHE STRING "Target iOS version" FORCE)

# ---------------------------------------------------------------------------
# Language standard — Cocos Creator 3.8+ requires C++17.
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 17)

# ---------------------------------------------------------------------------
# Engine feature toggles.
# Each option maps to a CMake preprocessor define that the engine uses to
# conditionally compile (or skip) subsystems. Disable anything you don't need
# to shrink the final binary and speed up builds.
# ---------------------------------------------------------------------------

# Debug / profiling options
option(CC_DEBUG_FORCE           "Force enable CC_DEBUG in release mode" OFF)

# JavaScript engine backend (exactly one should be ON)
option(USE_SE_V8               "Use V8 JavaScript Engine"              ON)
option(USE_SE_JSVM             "Use JSVM JavaScript Engine"            OFF)
option(USE_SE_JSC              "Use JavaScriptCore on MacOSX/iOS"      OFF)

# V8 remote debugger (Chrome DevTools integration)
option(USE_V8_DEBUGGER         "Compile v8 inspector ws server"        ON)
option(USE_V8_DEBUGGER_FORCE   "Force enable debugger in release mode" OFF)

# Networking
option(USE_SOCKET              "Enable WebSocket & SocketIO"           ON)

# Media / UI components
option(USE_AUDIO               "Enable Audio"                          ON)
option(USE_EDIT_BOX            "Enable EditBox"                        ON)
option(USE_VIDEO               "Enable VideoPlayer Component"          ON)
option(USE_WEBVIEW             "Enable WebView Component"              ON)

# Middleware (2D skeletal animation, etc.)
option(USE_MIDDLEWARE          "Enable Middleware"                     ON)
option(USE_DRAGONBONES         "Enable Dragonbones"                    ON)
option(USE_SPINE_3_8           "Enable Spine 3.8"                      ON)
option(USE_SPINE_4_2           "Enable Spine 4.2"                      OFF)

# Networking utilities
option(USE_WEBSOCKET_SERVER    "Enable WebSocket Server"               OFF)

# Job / task scheduling backends (pick at most one, or leave all off for default)
option(USE_JOB_SYSTEM_TASKFLOW "Use taskflow as job system backend"    OFF)
option(USE_JOB_SYSTEM_TBB      "Use tbb as job system backend"         OFF)

# Physics engine
option(USE_PHYSICS_PHYSX       "Use PhysX Physics"                     ON)

# Rendering helpers
option(USE_OCCLUSION_QUERY     "Use Occlusion Query"                   ON)
option(USE_DEBUG_RENDERER      "Use Debug Renderer"                    ON)
option(USE_GEOMETRY_RENDERER   "Use Geometry Renderer"                 ON)

# Image format support
option(USE_WEBP                "Use Webp"                              ON)

# ---------------------------------------------------------------------------
# Validate required variables — fatal error if missing.
# ---------------------------------------------------------------------------
if(NOT RES_DIR)
    message(FATAL_ERROR "RES_DIR is not set!")
endif()

# Pull in the project-specific build config exported by Cocos Creator.
# This defines variables like APPLICATION_ID, PROP_COMPILE_SDK_VERSION, etc.
include(${RES_DIR}/proj/cfg.cmake)

# Optionally include a local-only overrides file (git-ignored).
if(EXISTS ${CMAKE_CURRENT_LIST_DIR}/localCfg.cmake)
    include(${CMAKE_CURRENT_LIST_DIR}/localCfg.cmake)
endif()

if(NOT COCOS_X_PATH)
    message(FATAL_ERROR "COCOS_X_PATH is not set!")
endif()

# If XR / AR features are enabled, bring in the XR plugin cmake module.
if(USE_XR OR USE_AR_MODULE)
    include(${CMAKE_CURRENT_LIST_DIR}/xr.cmake)
endif()

# ---------------------------------------------------------------------------
# Include the Cocos Creator engine build system.
# This sets up all engine targets, libraries, and compile definitions.
# ---------------------------------------------------------------------------
include(${COCOS_X_PATH}/CMakeLists.txt)

# ---------------------------------------------------------------------------
# Append the game's own C++ sources to the engine source list.
# The platform-specific CMakeLists.txt will compile these into the final binary.
# ---------------------------------------------------------------------------
list(APPEND CC_COMMON_SOURCES
    ${CMAKE_CURRENT_LIST_DIR}/Classes/Game.h
    ${CMAKE_CURRENT_LIST_DIR}/Classes/Game.cpp
)
