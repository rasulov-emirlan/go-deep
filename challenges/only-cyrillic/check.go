package main

func main() {
	check("example", func() (any, any) { return OnlyCyrillic("Hello, Мир! 123 ёлка"), "Мирёлка" })
	check("ё and Ё", func() (any, any) { return OnlyCyrillic("Ёж, ёж!"), "Ёжёж" })
	check("no Russian letters", func() (any, any) { return OnlyCyrillic("abc 123"), "" })
	check("drops non-Russian Cyrillic", func() (any, any) { return OnlyCyrillic("Бишкек өң"), "Бишкек" })
	check("empty", func() (any, any) { return OnlyCyrillic(""), "" })
	done()
}
