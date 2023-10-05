#!/bin/sh

grep "HTTP Server ready for requests" test.log > /dev/null 2>&1 ;
while [ "$?" -ne "0" ] ;  do
    sleep 1;
    grep "HTTP Server ready for requests" test.log > /dev/null 2>&1
done
