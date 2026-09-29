package main

func main() {
	check("enough letters", func() (any, any) { return CanBuildString("aabbc", "abca"), true })
	check("letter used twice", func() (any, any) { return CanBuildString("abc", "aa"), false })
	check("cyrillic", func() (any, any) { return CanBuildString("привет", "вет"), true })
	check("missing letter", func() (any, any) { return CanBuildString("кот", "кит"), false })
	check("empty target", func() (any, any) { return CanBuildString("", ""), true })
	check("target longer", func() (any, any) { return CanBuildString("ab", "abc"), false })
	done()
}
