# ============================================================================
# xr.cmake
# Optional XR / AR plugin integration for Cocos Creator native builds.
#
# This file is included only when USE_XR or USE_AR_MODULE is enabled in the
# common CMakeLists.txt. It locates the XR plugin sources and libraries
# relative to the extensions directory.
# ============================================================================

# Pull in the engine's predefine macros (needed by the XR plugin).
include(${COCOS_X_PATH}/cmake/predefine.cmake)

# Initialise accumulator variables for XR sources and libraries.
# These are appended to by the downstream xr.cmake from the plugin.
if(NOT DEFINED XR_COMMON_SOURCES)
    set(XR_COMMON_SOURCES)
endif()

if(NOT DEFINED XR_LIBS)
    set(XR_LIBS)
endif()

# ---------------------------------------------------------------------------
# Path defaults — assume the XR plugin lives under extensions/xr-plugin/.
# Override these if the plugin is installed elsewhere.
# ---------------------------------------------------------------------------

# Shared XR source files (platform-agnostic).
if(NOT DEFINED XR_COMMON_PATH)
    set(XR_COMMON_PATH ${CMAKE_CURRENT_LIST_DIR}/../../../extensions/xr-plugin/common)
endif()

# Platform-specific XR libraries (e.g. OpenXR, ARCore).
if(NOT DEFINED XR_LIBRARY_PATH)
    set(XR_LIBRARY_PATH ${CMAKE_CURRENT_LIST_DIR}/../../../extensions/xr-plugin/platforms)
endif()

# Include the plugin's own cmake which populates XR_COMMON_SOURCES and XR_LIBS.
include(${XR_COMMON_PATH}/xr.cmake)
