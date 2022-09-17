#!/bin/bash
# update ios project file to use same version as ui and current date as build number
# deps: jq

DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
VERSION=$(cat $DIR/../package.json | grep '"version"' | cut -d '"' -f4)
BUILD=$(date +"%Y%m%d%H%M%S")

PROJECT_DIR="$DIR/spr.xcodeproj"
PROJECT_FILE="$PROJECT_DIR/project.pbxproj"

cat "$PROJECT_FILE" | \
	sed "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/g" | \
	sed "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD;/g" \
	> "${PROJECT_FILE}.new" && \
	mv "${PROJECT_FILE}.new" $PROJECT_FILE
