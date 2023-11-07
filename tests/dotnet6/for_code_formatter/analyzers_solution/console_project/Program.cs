using System;
using library;

namespace codestyle_project
{
    internal class Program
    {
        private static void Main(string[] args)
        {
            var speaker = new Speaker();
            Console.WriteLine(speaker.SayHello("World"));
        }
    }
}
