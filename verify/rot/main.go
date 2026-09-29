package main

import "fmt"

func main() {
	seen := map[string]int{}
	for r := 0; r < 2000; r++ {
		m := map[int]bool{}
		for i := 1; i <= 5; i++ {
			m[i] = true
		}
		s := ""
		for k := range m {
			s += fmt.Sprint(k)
		}
		seen[s]++
	}
	fmt.Println(seen)
	n := map[int]int{}
	for r := 0; r < 1000; r++ {
		m := map[int]bool{1: true, 2: true, 3: true}
		c := 0
		for k := range m {
			m[k+100] = true
			c++
		}
		n[c]++
	}
	fmt.Println(n)
}
