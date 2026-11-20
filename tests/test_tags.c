#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <limits.h>
#include <unistd.h>
#include <assert.h>
#include "../source/tags.h"
static void sync4(unsigned char *p,unsigned n){p[0]=(n>>21)&127;p[1]=(n>>14)&127;p[2]=(n>>7)&127;p[3]=n&127;}
static void fixture(const char *path,int version,bool truncated){
 const unsigned char value[]={3,'O','l',0xc3,0xa1};unsigned head=version==2?6:10;
 unsigned char h[10]={'I','D','3',0,0,0,0,0,0,0},frame[10]={0};h[3]=version;sync4(h+6,head+sizeof(value));
 memcpy(frame,version==2?"TT2":"TIT2",version==2?3:4);
 if(version==2)frame[5]=sizeof(value);else if(version==3)frame[7]=sizeof(value);else sync4(frame+4,sizeof(value));
 FILE *f=fopen(path,"wb");assert(f);assert(fwrite(h,1,10,f)==10);assert(fwrite(frame,1,head,f)==head);if(!truncated)assert(fwrite(value,1,sizeof(value),f)==sizeof(value));fclose(f);
}
int main(int argc,char **argv){
 char path[]="/tmp/kplayer-id3-XXXXXX";int fd=mkstemp(path);assert(fd>=0);close(fd);
 for(int version=2;version<=4;version++){fixture(path,version,false);LocalTags t;read_local_tags(path,&t);assert(!strcmp(t.title,"Olá"));free_local_tags(&t);fixture(path,version,true);read_local_tags(path,&t);assert(!*t.title);free_local_tags(&t);}
 unlink(path);
 if(argc>1){LocalTags t;read_local_tags(argv[1],&t);assert(!strcmp(t.title,"Get Lucky (feat. Pharrell Williams and Nile Rodgers)"));assert(!strcmp(t.album,"Random Access Memories"));assert(t.picture_size==98617&&t.lyrics);free_local_tags(&t);}
 puts("PASS: ID3v2.2/2.3/2.4, truncated data and supplied MP3 metadata");return 0;
}
