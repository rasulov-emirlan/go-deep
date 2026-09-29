package main

func main() {
	check("1 is 2^0", func() (any, any) { return IsPowerOfTwo(1), true })
	check("1024", func() (any, any) { return IsPowerOfTwo(1024), true })
	check("2^62", func() (any, any) { return IsPowerOfTwo(1 << 62), true })
	check("zero", func() (any, any) { return IsPowerOfTwo(0), false })
	check("negative", func() (any, any) { return IsPowerOfTwo(-8), false })
	check("6 and 1023", func() (any, any) { return IsPowerOfTwo(6) || IsPowerOfTwo(1023), false })
	done()
}
