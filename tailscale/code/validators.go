package tailscale_plugin

import (
	"errors"
	"net"
	"reflect"
	"time"
)

func isValidIPv4(v interface{}, param string) error {
	st := reflect.ValueOf(v)
	if st.Kind() != reflect.String {
		return errors.New(param + " must be a string")
	}

	if result := net.ParseIP(st.String()); result == nil {
		return errors.New(param + " is not a valid IP address")
	}

	return nil
}

func isValidDuration(v interface{}, param string) error {
	st := reflect.ValueOf(v)
	if st.Kind() != reflect.String {
		return errors.New(param + " must be a string")
	}

	_, err := time.ParseDuration(st.String())
	return err
}
