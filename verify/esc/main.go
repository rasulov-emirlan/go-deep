package main

import "fmt"

type node struct {
	next *node
	v    int
}

func leak() *node {
	n := node{v: 1}
	return &n
}

func f() {
	x := 42
	y := x * 2
	p := &x
	_ = *p
	_ = y
	fmt.Println(x)
}

func main() {
	_ = leak()
	f()
}
