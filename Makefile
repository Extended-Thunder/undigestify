all: undigestify.xpi

CMD=find . \( \( -name RCS -o -name .svn -o -name .git \) -prune \) \
    -o \! -name .gitignore \! -name '*~' \
    \! -name '.\#*' \! -name '*,v' \! -name Makefile \! -name '*.xpi' \
    \! -name '\#*' \! -name '*.pl' -type f -print
FILES=$(shell $(CMD))

undigestify.xpi: $(FILES)
	rm -f $@.tmp
	zip -r $@.tmp $(FILES)
	mv $@.tmp $@

clean: ; -rm -f undigestify.xpi
