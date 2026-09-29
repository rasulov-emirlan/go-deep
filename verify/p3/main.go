package main

import (
	"fmt"
	"runtime"
	"sync"
)

func main() {
	runtime.GOMAXPROCS(1)
	var wg sync.WaitGroup
	wg.Add(3)
	go func() { defer wg.Done(); fmt.Println("A") }()
	go func() { defer wg.Done(); fmt.Println("B") }()
	go func() { defer wg.Done(); runtime.Gosched(); fmt.Println("C") }()
	wg.Wait()
}
