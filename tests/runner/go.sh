#!/bin/bash
DIR_TEST=/code

export API_URL=${API_URL:-"http://localhost:8000"}
export AUTH=${AUTH:-"admin:admin"}
echo "+ API_URL= $API_URL"

echo "+ RUNNING TESTS"
cd $DIR_TEST && npm run test

exit $?
