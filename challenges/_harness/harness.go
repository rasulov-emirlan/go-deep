package main

import (
	"fmt"
	"os"
	"reflect"
)

var passed, total int

// check runs one test case. f returns what the solution produced and what we expect.
func check(name string, f func() (got, want any)) {
	total++
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("✗ %s: panic: %v\n", name, r)
		}
	}()
	got, want := f()
	if reflect.DeepEqual(got, want) {
		passed++
		fmt.Printf("✓ %s\n", name)
		return
	}
	fmt.Printf("✗ %s: got %s, want %s\n", name, show(got), show(want))
}

// ok is for cases a plain comparison can't express.
func ok(name string, f func() (pass bool, why string)) {
	total++
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("✗ %s: panic: %v\n", name, r)
		}
	}()
	if pass, why := f(); pass {
		passed++
		fmt.Printf("✓ %s\n", name)
	} else {
		fmt.Printf("✗ %s: %s\n", name, why)
	}
}

func show(v any) string {
	if s, isStr := v.(string); isStr {
		return fmt.Sprintf("%q", s)
	}
	if rv := reflect.ValueOf(v); v == nil || (rv.Kind() == reflect.Slice || rv.Kind() == reflect.Map || rv.Kind() == reflect.Pointer) && rv.IsNil() {
		return "nil"
	}
	return fmt.Sprintf("%v", v)
}

// done prints the verdict line the site parses.
func done() {
	fmt.Printf("RESULT %d/%d\n", passed, total)
	if passed != total {
		os.Exit(1)
	}
}
