#!/bin/sh

grep "WEBSOCKET Starting Websocket Server attached to https" test.log > /dev/null 2>&1 ;
while [ "$?" -ne "0" ] ;  do
    sleep 1;
    grep "WEBSOCKET Starting Websocket Server attached to https" test.log > /dev/null 2>&1
done
