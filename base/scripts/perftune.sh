#!/bin/bash

# Do a little more work than irqbalance.

# The PI board has USB stuck on cpu 0 by default. Since the wifi dongle is stuck there,
# Move receive/xmit queues off of it

grep -q "Raspberry Pi Compute Module 5 Rev" /proc/cpuinfo && exit

# e -> cpus 1-3, not cpu 0

for x in `echo /sys/class/net/*/queues/*/{r,x}ps_cpus`; do echo e > $x; done

# Change eth0 smp affinity list

eth0_irqs=`cat /proc/interrupts  | grep eth0 | awk '{print $1}' | tr -d :`
for x in $eth0_irqs
do
	echo 1-3 > /proc/irq/${x}/smp_affinity_list
done

#disable scaling
for x in `echo /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor`; do echo performance > $x; done
