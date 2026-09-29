package main

import (
	"fmt"
	"runtime"
)

func main() {
	runtime.GOMAXPROCS(1)
	ch := make(chan int)
	go func() {
		for i := 0; i < 3; i++ {
			ch <- i
			fmt.Println("sent", i)
		}
		close(ch)
	}()
	for v := range ch {
		fmt.Println("recv", v)
	}
}
