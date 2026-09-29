package main

import (
	"fmt"
	"reflect"
)

func main() {
	ok("returns an error", func() (bool, string) { return Handle() != nil, "Handle returned nil" })
	check("message", func() (any, any) { return Handle().Error(), "went wrong" })
	ok("your own type", func() (bool, string) {
		t := reflect.TypeOf(Handle())
		if t.Kind() == reflect.Pointer {
			t = t.Elem()
		}
		return t.PkgPath() == "main", fmt.Sprintf("the error is a %T, define your own type instead", Handle())
	})
	done()
}
