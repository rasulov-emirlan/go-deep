package main

import (
	"fmt"
	"math"
)

func main() {
	m := map[float64]int{}
	m[math.NaN()] = 1
	m[math.NaN()] = 2
	_, ok := m[math.NaN()]
	delete(m, math.NaN())
	fmt.Println(len(m), ok)
	z := map[float64]string{}
	z[0.0] = "pos"
	z[math.Copysign(0, -1)] = "neg"
	for k, v := range z {
		fmt.Println(len(z), k, v)
	}
}
